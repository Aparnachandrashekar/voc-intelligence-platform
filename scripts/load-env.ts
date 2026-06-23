import { config } from "dotenv";
import { existsSync } from "fs";
import path from "path";

const envLocal = path.resolve(process.cwd(), ".env.local");
const envFile = path.resolve(process.cwd(), ".env");

if (existsSync(envLocal)) {
  config({ path: envLocal });
} else if (existsSync(envFile)) {
  config({ path: envFile });
} else {
  config({ path: path.resolve(process.cwd(), ".env.example") });
}
