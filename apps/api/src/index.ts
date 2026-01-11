import { plus100 } from "@repo/core";
import { Hono } from "hono";

const app = new Hono();

app.get("/:value", (c) => {
  const value = c.req.param("value");
  const pasedValue = Number.parseInt(value, 10);

  return c.json({ message: "Hello, World!", plus100: plus100(pasedValue) });
});

export default app;
