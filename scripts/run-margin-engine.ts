import { config } from "dotenv";

config({ path: ".env" });

async function runMarginEngine() {
  const { runTlcMarginAnalysis } = await import("@/app/actions/margin-engine");
  const result = await runTlcMarginAnalysis();
  console.log(result);
}

runMarginEngine().catch((error) => {
  console.error(error);
  process.exit(1);
});
