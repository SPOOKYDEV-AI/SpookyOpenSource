import { ServiceSupervisor } from "../src/index.js";

const supervisor = new ServiceSupervisor({
  stateFile: ".runtime/example-supervisor.json",
  services: [{
    name: "demo-worker",
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    readiness: ({ child, bootId }) => ({
      ready: child.exitCode === null,
      pid: child.pid,
      bootId,
    }),
  }],
  onLog(entry) {
    console.log(entry);
  },
});

await supervisor.start();

console.log("READY", supervisor.snapshot());

process.on("SIGINT", async () => {
  await supervisor.stop();
  process.exit(0);
});
