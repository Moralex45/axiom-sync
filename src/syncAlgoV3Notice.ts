import { type App, Modal } from "obsidian";
import type { TransItemType } from "./i18n";
import { logInfo } from "./log";
import type AxiomSyncPlugin from "./main"; // unavoidable

import { stringToFragment } from "./misc";

type I18nVars = Record<string, string | number | boolean | null | undefined>;

export class SyncAlgoV3Modal extends Modal {
  agree: boolean;
  manualBackup: boolean;
  requireUpdateAllDev: boolean;
  readonly plugin: AxiomSyncPlugin;
  constructor(app: App, plugin: AxiomSyncPlugin) {
    super(app);
    this.plugin = plugin;
    this.agree = false;
    this.manualBackup = false;
    this.requireUpdateAllDev = false;
  }

  renderContent() {
    const { contentEl } = this;
    contentEl.empty();

    const t = (x: TransItemType, vars?: I18nVars) => {
      return this.plugin.i18n.t(x, vars);
    };

    const headerRow = contentEl.createDiv({
      cls: "syncalgov3-header-row",
    });
    headerRow.createEl("h2", {
      text: t("syncalgov3_title"),
    });
    const langSwitch = headerRow.createDiv({
      cls: "syncalgov3-lang-switch",
    });
    langSwitch
      .createEl("button", {
        text: t("settings_lang_ru"),
      })
      .addEventListener("click", () => {
        void this.plugin.i18n.changeTo("ru").then(() => {
          this.renderContent();
        });
      });
    langSwitch
      .createEl("button", {
        text: t("settings_lang_en"),
      })
      .addEventListener("click", () => {
        void this.plugin.i18n.changeTo("en").then(() => {
          this.renderContent();
        });
      });

    const ul = contentEl.createEl("ul");
    t("syncalgov3_texts")
      .split("\n")
      .forEach((val) => {
        const li = ul.createEl("li");
        li.append(stringToFragment(val));
      });

    // code modified partially from BART released under MIT License
    contentEl.createDiv("modal-button-container", (buttonContainerEl) => {
      let agreeBtn: HTMLButtonElement | undefined = undefined;

      buttonContainerEl.createEl(
        "label",
        {
          cls: "mod-checkbox",
        },
        (labelEl) => {
          const checkboxEl = labelEl.createEl("input", {
            attr: { tabindex: -1 },
            type: "checkbox",
          });
          checkboxEl.checked = this.manualBackup;
          checkboxEl.addEventListener("click", () => {
            this.manualBackup = checkboxEl.checked;
            if (agreeBtn !== undefined) {
              if (this.manualBackup && this.requireUpdateAllDev) {
                agreeBtn.removeAttribute("disabled");
              } else {
                agreeBtn.setAttr("disabled", true);
              }
            }
          });
          labelEl.appendText(t("syncalgov3_checkbox_manual_backup"));
        }
      );

      buttonContainerEl.createEl(
        "label",
        {
          cls: "mod-checkbox",
        },
        (labelEl) => {
          const checkboxEl = labelEl.createEl("input", {
            attr: { tabindex: -1 },
            type: "checkbox",
          });
          checkboxEl.checked = this.requireUpdateAllDev;
          checkboxEl.addEventListener("click", () => {
            this.requireUpdateAllDev = checkboxEl.checked;
            if (agreeBtn !== undefined) {
              if (this.manualBackup && this.requireUpdateAllDev) {
                agreeBtn.removeAttribute("disabled");
              } else {
                agreeBtn.setAttr("disabled", true);
              }
            }
          });
          labelEl.appendText(t("syncalgov3_checkbox_requiremultidevupdate"));
        }
      );

      agreeBtn = buttonContainerEl.createEl("button", {
        attr: { type: "button" },
        cls: "mod-cta",
        text: t("syncalgov3_button_agree"),
      });
      agreeBtn.setAttr("disabled", true);
      agreeBtn.addEventListener("click", () => {
        this.agree = true;
        this.close();
      });

      buttonContainerEl
        .createEl("button", {
          attr: { type: "submit" },
          text: t("syncalgov3_button_disagree"),
        })
        .addEventListener("click", () => {
          this.close();
        });
    });
  }

  onOpen() {
    this.renderContent();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.agree) {
      logInfo("agree to use the new algorithm");
      void this.plugin.saveAgreeToUseNewSyncAlgorithm();
      this.plugin.enableAutoSyncIfSet();
      this.plugin.enableInitSyncIfSet();
      this.plugin.toggleSyncOnSaveIfSet();
    } else {
      logInfo("do not agree to use the new algorithm");
      this.plugin.unload();
    }
  }
}
