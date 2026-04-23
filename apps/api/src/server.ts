import { env } from "./config/env.js";
import { app } from "./app.js";

app.listen(env.API_PORT, () => {
  console.log(`API ${env.API_PORT} portunda dinleniyor`);
});
