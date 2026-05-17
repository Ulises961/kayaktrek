import { Page } from "@playwright/test"

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login")
  }

  async login(mail: string, pwd: string) {
    await this.page.goto("/login")
    await this.page.getByLabel("Email").fill(mail)
    await this.page.getByLabel("Password").fill(pwd)
    await this.page.getByRole("button", { name: "Sign in" }).click()
    await this.page.waitForURL("**/dashboard")
  }
}
