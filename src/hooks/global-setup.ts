import dotenv from "dotenv";

dotenv.config();

export default async function globalSetup(): Promise<void> {
  // Environment variables are loaded via dotenv before tests run.
}
