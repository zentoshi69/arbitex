import { test as setup } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/operator.json");

setup("authenticate as operator", async ({ page }) => {
  // In dev mode the dashboard may not require auth — 
  // adjust this to match your actual auth flow.
  await page.goto("/");

  // If there's a login form, fill it:
  const loginForm = page.locator("input[name='apiKey']");
  if (await loginForm.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loginForm.fill(process.env["OPERATOR_API_KEY"] ?? "dev_operator_api_key");
    await page.locator("button[type='submit']").click();
    await page.waitForURL("/");
  }

  // Save auth state (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });
});
