import path from 'node:path'
import fs from 'fs-extra'
import { nodeFileTrace } from '@vercel/nft'
const __dirname = import.meta.dirname
// !!! if any new dependencies are added, update the Dockerfile !!!

const projectRoot = path.resolve(process.env.PROJECT_ROOT || path.join(__dirname, '../..'))
const resultFolder = path.join(projectRoot, 'app-minimal') // no need to resolve, ProjectRoot is always absolute
const pkg = await fs.readJSON(path.join(projectRoot, 'package.json'))

let mainPath = ''
// 支持多种可能的入口点
const mainPaths = [pkg.main, 'dist/cli.cjs', 'dist/cli.mjs', 'dist/index.cjs', 'dist/index.mjs']
for (const key of mainPaths) {
    if (!key) {
        continue
    }
    const fullPath = path.join(projectRoot, key)
    if (await fs.pathExists(fullPath)) {
        mainPath = fullPath
        break
    }
}
if (!mainPath) {
    console.error('Could not find entry point in:', mainPaths)
    process.exit(1)
}

console.log('Start analyzing, entry point:', mainPath, 'project root:', projectRoot)
const files = [mainPath]
const { fileList: fileSet } = await nodeFileTrace(files, {
    base: projectRoot,
})
let fileList = [...fileSet]
console.log('Total touchable files:', fileList.length)
fileList = fileList.filter((file) => file.startsWith('node_modules')) // only need node_modules
console.log('Total files need to be copied (touchable files in node_modules/):', fileList.length)
console.log('Start copying files, destination:', resultFolder)
await Promise.all(fileList.map((e) => fs.copy(path.join(projectRoot, e), path.join(resultFolder, e)))).catch((error) => {
    // fix unhandled promise rejections
    console.error(error, error.stack)
    process.exit(1)
})
