import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import * as ts from "typescript"

const projectRoot = path.resolve(import.meta.dirname, "..")
const sourceRoot = path.join(projectRoot, "src")
const i18nPath = path.join(sourceRoot, "i18n.ts")

function unwrap(node: ts.Node | undefined): ts.Node | undefined {
  let current = node
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression
  }
  return current
}

function getPropertyName(node: ts.ObjectLiteralElementLike): string | null {
  if (!node.name) return null
  if (ts.isIdentifier(node.name)) return node.name.text
  if (ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) return node.name.text
  return null
}

function getObjectProperty(object: ts.Node | undefined, name: string): ts.Node | undefined {
  const unwrapped = unwrap(object)
  if (!unwrapped || !ts.isObjectLiteralExpression(unwrapped)) return undefined

  for (const property of unwrapped.properties) {
    if (ts.isPropertyAssignment(property) && getPropertyName(property) === name) {
      return unwrap(property.initializer)
    }
  }
  return undefined
}

function getResourceObject(sourceFile: ts.SourceFile): ts.Node | undefined {
  let resourceObject: ts.Node | undefined

  function visit(node: ts.Node) {
    if (resourceObject) return
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "resources"
    ) {
      resourceObject = unwrap(node.initializer)
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return resourceObject
}

function flattenObjectKeys(
  object: ts.Node | undefined,
  prefix = "",
  keys = new Set<string>(),
): Set<string> {
  const unwrapped = unwrap(object)
  if (!unwrapped || !ts.isObjectLiteralExpression(unwrapped)) return keys

  for (const property of unwrapped.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = getPropertyName(property)
    if (name === null) continue

    const key = prefix ? `${prefix}.${name}` : name
    const value = unwrap(property.initializer)
    if (value && ts.isObjectLiteralExpression(value)) flattenObjectKeys(value, key, keys)
    else keys.add(key)
  }

  return keys
}

function getStaticKeysFromArgument(argument: ts.Expression | undefined, keys: Set<string>) {
  if (!argument) return
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    keys.add(argument.text)
    return
  }
  if (ts.isConditionalExpression(argument)) {
    getStaticKeysFromArgument(argument.whenTrue, keys)
    getStaticKeysFromArgument(argument.whenFalse, keys)
    return
  }
  if (ts.isParenthesizedExpression(argument) || ts.isAsExpression(argument)) {
    getStaticKeysFromArgument(argument.expression, keys)
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
    const source = fs.readFileSync(filePath, "utf8")
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression
        const isTranslationCall =
          (ts.isIdentifier(expression) && expression.text === "t") ||
          (ts.isPropertyAccessExpression(expression) && expression.name.text === "t")
        if (isTranslationCall) getStaticKeysFromArgument(node.arguments[0], keys)
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return keys
}

test("all static translation calls exist in both locales", () => {
  const source = fs.readFileSync(i18nPath, "utf8")
  const sourceFile = ts.createSourceFile(
    i18nPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const resources = getResourceObject(sourceFile)
  const missing: string[] = []

  for (const [locale, keys] of ["zh-CN", "en"].map(
    (locale) =>
      [
        locale,
        flattenObjectKeys(getObjectProperty(getObjectProperty(resources, locale), "translation")),
      ] as const,
  )) {
    for (const key of collectStaticTranslationKeys()) {
      if (!keys.has(key)) missing.push(`${locale}:${key}`)
    }
  }

  assert.deepEqual(missing, [])
})
