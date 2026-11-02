import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { parse } from "@babel/parser"
import * as ast from "@babel/types"

const projectRoot = path.resolve(import.meta.dirname, "..")
const sourceRoot = path.join(projectRoot, "src")
const i18nPath = path.join(sourceRoot, "i18n.ts")

function parseSource(filePath: string): ast.File {
  return parse(fs.readFileSync(filePath, "utf8"), {
    sourceType: "module",
    plugins: filePath.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
  })
}

function unwrap(node: ast.Node | null | undefined): ast.Node | undefined {
  let current = node ?? undefined
  while (
    ast.isTSAsExpression(current) ||
    ast.isTSSatisfiesExpression(current) ||
    ast.isParenthesizedExpression(current) ||
    ast.isTSTypeAssertion(current)
  ) {
    current = current.expression
  }
  return current
}

function getPropertyName(node: ast.ObjectProperty): string | null {
  if (node.computed) return null
  if (ast.isIdentifier(node.key)) return node.key.name
  if (ast.isStringLiteral(node.key) || ast.isNumericLiteral(node.key)) return String(node.key.value)
  return null
}

function getObjectProperty(object: ast.Node | undefined, name: string): ast.Node | undefined {
  const unwrapped = unwrap(object)
  if (!ast.isObjectExpression(unwrapped)) return undefined
  for (const property of unwrapped.properties) {
    if (ast.isObjectProperty(property) && getPropertyName(property) === name) {
      return unwrap(property.value)
    }
  }
  return undefined
}

function getResourceObject(sourceFile: ast.File): ast.Node | undefined {
  let resourceObject: ast.Node | undefined
  ast.traverseFast(sourceFile, (node) => {
    if (ast.isVariableDeclarator(node) && ast.isIdentifier(node.id, { name: "resources" })) {
      resourceObject = unwrap(node.init)
    }
  })
  return resourceObject
}

function flattenObjectKeys(
  object: ast.Node | undefined,
  prefix = "",
  keys = new Set<string>(),
): Set<string> {
  const unwrapped = unwrap(object)
  if (!ast.isObjectExpression(unwrapped)) return keys
  for (const property of unwrapped.properties) {
    if (!ast.isObjectProperty(property)) continue
    const name = getPropertyName(property)
    if (name === null) continue
    const key = prefix ? `${prefix}.${name}` : name
    const value = unwrap(property.value)
    if (ast.isObjectExpression(value)) flattenObjectKeys(value, key, keys)
    else keys.add(key)
  }
  return keys
}

function getStaticKeysFromArgument(argument: ast.Node | undefined, keys: Set<string>) {
  const value = unwrap(argument)
  if (ast.isStringLiteral(value)) {
    keys.add(value.value)
  } else if (ast.isTemplateLiteral(value) && value.expressions.length === 0) {
    keys.add(value.quasis[0].value.cooked ?? value.quasis[0].value.raw)
  } else if (ast.isConditionalExpression(value)) {
    getStaticKeysFromArgument(value.consequent, keys)
    getStaticKeysFromArgument(value.alternate, keys)
  }
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listSourceFiles(filePath))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(filePath)
  }
  return files
}

function collectStaticTranslationKeys(): Set<string> {
  const keys = new Set<string>()
  for (const filePath of listSourceFiles(sourceRoot)) {
    ast.traverseFast(parseSource(filePath), (node) => {
      if (!ast.isCallExpression(node)) return
      const expression = node.callee
      const isTranslationCall =
        ast.isIdentifier(expression, { name: "t" }) ||
        (ast.isMemberExpression(expression) &&
          !expression.computed &&
          ast.isIdentifier(expression.property, { name: "t" }))
      if (isTranslationCall) getStaticKeysFromArgument(node.arguments[0], keys)
    })
  }
  return keys
}

test("all static translation calls exist in both locales", () => {
  const resources = getResourceObject(parseSource(i18nPath))
  assert.ok(resources, "Translation resources must be found")
  const usedKeys = collectStaticTranslationKeys()
  assert.ok(usedKeys.size > 0, "Translation calls must be found")
  const missing: string[] = []
  for (const locale of ["zh-CN", "en"]) {
    const keys = flattenObjectKeys(
      getObjectProperty(getObjectProperty(resources, locale), "translation"),
    )
    assert.ok(keys.size > 0, `Translation resources must exist for ${locale}`)
    for (const key of usedKeys) {
      if (!keys.has(key)) missing.push(`${locale}:${key}`)
    }
  }
  assert.deepEqual(missing, [])
})
