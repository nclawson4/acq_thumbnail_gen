import { getRedis } from "@/lib/rate-limit";
import { COST_KEY } from "@/lib/cost";

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const key = COST_KEY(date);
  const before = await getRedis().get<number | string>(key);
  await getRedis().del(key);
  console.log(`Reset ${key} (was ${before}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
