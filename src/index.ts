import { fileURLToPath } from "node:url"
import { main } from "./cli.js"

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await main()
  process.exitCode = exitCode
}

export { main }
