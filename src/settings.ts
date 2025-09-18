import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ConfluenceUploadPlugin from "./main";
import { ConfluenceSettings } from "./types";

export const DEFAULT_SETTINGS: ConfluenceSettings = {
  apiToken: "",
  baseUrl: "https://confluence.mycompany.com",
  useEnvironmentToken: false,
  defaultSpaceKey: "",
  lastPageId: "",
  authType: "bearer",
  username: "",
  enableMermaid: true,
};

export class ConfluenceSettingTab extends PluginSettingTab {
  plugin: ConfluenceUploadPlugin;

  constructor(app: App, plugin: ConfluenceUploadPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Confluence Upload Settings" });

    new Setting(containerEl)
      .setName("Confluence Base URL")
      .setDesc(
        "The base URL of your Confluence instance (e.g., https://confluence.mycompany.com)",
      )
      .addText((text) =>
        text
          .setPlaceholder("https://confluence.example.com")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.replace(/\/$/, "");
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Authentication Type")
      .setDesc(
        "Choose authentication method (Basic for Server/Data Center, Bearer for Cloud)",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("basic", "Basic (Username + API Token)")
          .addOption("bearer", "Bearer Token")
          .setValue(this.plugin.settings.authType)
          .onChange(async (value: "basic" | "bearer") => {
            this.plugin.settings.authType = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.authType === "basic") {
      new Setting(containerEl)
        .setName("Username")
        .setDesc("Your Confluence username")
        .addText((text) =>
          text
            .setPlaceholder("Enter your username")
            .setValue(this.plugin.settings.username)
            .onChange(async (value) => {
              this.plugin.settings.username = value;
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Use Environment Variable for Token")
      .setDesc(
        "Use CONFLUENCE_API_TOKEN environment variable instead of storing token in settings",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useEnvironmentToken)
          .onChange(async (value) => {
            this.plugin.settings.useEnvironmentToken = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (!this.plugin.settings.useEnvironmentToken) {
      new Setting(containerEl)
        .setName(
          this.plugin.settings.authType === "basic"
            ? "API Token / Password"
            : "API Token",
        )
        .setDesc(
          this.plugin.settings.authType === "basic"
            ? "Your Confluence API token or password"
            : "Your Confluence API token (stored securely)",
        )
        .addText(
          (text) =>
            (text
              .setPlaceholder("Enter your API token or password")
              .setValue(this.plugin.settings.apiToken)
              .onChange(async (value) => {
                this.plugin.settings.apiToken = value;
                await this.plugin.saveSettings();
              }).inputEl.type = "password"),
        );
    }

    new Setting(containerEl)
      .setName("Default Space Key")
      .setDesc("Optional: Default Confluence space key for new pages")
      .addText((text) =>
        text
          .setPlaceholder("e.g., TEAM")
          .setValue(this.plugin.settings.defaultSpaceKey)
          .onChange(async (value) => {
            this.plugin.settings.defaultSpaceKey = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Render Mermaid Charts")
      .setDesc(
        "Convert Mermaid diagrams to SVG images and upload as attachments to Confluence",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableMermaid)
          .onChange(async (value) => {
            this.plugin.settings.enableMermaid = value;
            await this.plugin.saveSettings();
            // Update the converter with new setting
            this.plugin.converter = new (
              await import("./simpleConverter")
            ).SimpleConfluenceConverter(value);
          }),
      );

    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Verify your Confluence connection settings")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setButtonText("Testing...");
          button.setDisabled(true);

          try {
            const result = await this.plugin.api.testConnection();
            if (result) {
              new Notice("✅ Connection successful!");
            } else {
              new Notice("❌ Connection failed. Please check your settings.");
            }
          } catch (error) {
            console.error("Connection test error:", error);
            new Notice(
              `❌ Connection failed: ${error.message || "Unknown error"}`,
            );
          } finally {
            button.setButtonText("Test");
            button.setDisabled(false);
          }
        }),
      );

    containerEl.createEl("h3", { text: "Usage" });
    containerEl.createEl("p", {
      text: 'Use the command palette (Ctrl/Cmd + P) and search for "Upload current note to Confluence"',
    });
  }
}
