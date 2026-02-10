import { fib } from "@repo/core";
import { Elysia } from "elysia";
import z from "zod";

const app = new Elysia()
  .get(
    "/fib/:n",
    ({ status, params }) => {
      const { n } = params;

      const result = fib(n);

      return status(200, { result });
    },
    {
      params: z.object({
        n: z.coerce.number().positive(),
      }),
    }
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
