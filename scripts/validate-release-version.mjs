import fs from "node:fs"

const stableVersionPattern = /^\d+\.\d+\.\d+$/
const releaseTagPattern = /^v\d+\.\d+\.\d+$/
const releaseTag = process.env.RELEASE_TAG || process.argv[2]

const packageVersion = JSON.parse(fs.readFileSync("package.json", "utf8")).version
const tauriVersion = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")).version
const cargoToml = fs.readFileSync("src-tauri/Cargo.toml", "utf8")
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const versions = { packageVersion, tauriVersion, cargoVersion }

if (!cargoVersion || new Set(Object.values(versions)).size !== 1) {
  throw new Error(`Version mismatch: ${JSON.stringify(versions)}`)
}

if (!stableVersionPattern.test(packageVersion)) {
  throw new Error(`Project version must be stable semver, got ${packageVersion}`)
}

if (releaseTag) {
  if (!releaseTagPattern.test(releaseTag)) {
    throw new Error(`Release tag must match v<major>.<minor>.<patch>, got ${releaseTag}`)
  }

  if (releaseTag.slice(1) !== packageVersion) {
    throw new Error(`Release tag ${releaseTag} does not match project version ${packageVersion}`)
  }
}

console.log(
  releaseTag
    ? `Validated DraftWhisper ${releaseTag}`
    : `Validated DraftWhisper version metadata (${packageVersion})`,
)
