import {
  AuthSupervisor,
  FileTokenStore,
  JwtTokenManager,
  ResilientAuthClient,
} from "../src/index.js";

async function refreshMyProvider() {
  // Replace this with your own authorized refresh/session flow.
  // Return: { token, expiresAt?, source? }
  throw Object.assign(
    new Error("Implement refreshMyProvider()"),
    { code: "AUTH_REQUIRED" }
  );
}

const store = new FileTokenStore({
  file: ".runtime/example-auth.json",
});

const tokenManager = new JwtTokenManager({
  store,
  refresh: refreshMyProvider,
  skewMs: 15 * 60_000,
});

const client = new ResilientAuthClient({
  tokenManager,
});

const supervisor = new AuthSupervisor({
  tokenManager,
  refreshBeforeMs: 20 * 60_000,
  onTransition({ previous, next, detail }) {
    console.log(
      `[auth] ${previous} -> ${next}`,
      detail
    );
  },
});

supervisor.start();

// Example:
// const response = await client.request(
//   "https://api.example.com/me"
// );
