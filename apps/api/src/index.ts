import cluster from "node:cluster";
import os from "node:os";
import process from "node:process";

const logEmoji = "🖥️";
const warningEmoji = "⚠️";

const disableCluster = process.env.DISABLE_CLUSTER === "true";
const numCPUs = os.availableParallelism();
const clusterWorkers = process.env.CLUSTER_WORKERS
  ? Number.parseInt(process.env.CLUSTER_WORKERS, 10)
  : numCPUs;

const isSingleCore = !disableCluster && numCPUs > 1 && clusterWorkers > 0;

if (isSingleCore && cluster.isPrimary) {
  const workers = Math.min(clusterWorkers, numCPUs);
  console.log(
    `${logEmoji} Primary ${process.pid} is running, forking ${workers} workers (${numCPUs} CPUs available)`
  );

  for (let i = 0; i < workers; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `${warningEmoji}  Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}), restarting...`
    );
    cluster.fork();
  });
} else {
  if (!isSingleCore) {
    if (disableCluster) {
      console.log(`${logEmoji} Cluster mode disabled via DISABLE_CLUSTER=true`);
    } else if (numCPUs === 1) {
      console.log(
        `${logEmoji} Single CPU detected, running in single-process mode`
      );
    } else if (clusterWorkers === 0) {
      console.log(`${logEmoji} Cluster mode disabled via CLUSTER_WORKERS=0`);
    }
  }

  await import("./server");

  if (isSingleCore) {
    console.log(`${logEmoji} Worker ${process.pid} started`);
  }
}
