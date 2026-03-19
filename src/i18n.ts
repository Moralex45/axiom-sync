import merge from "lodash/merge";
import Mustache from "mustache";
import { moment } from "obsidian";

import { LANGS as LANGS_PRO } from "../advanced/src/langs";
import { LANGS as LANGS_BASIC } from "./langs";

const LANGS = merge(LANGS_BASIC, LANGS_PRO);

export type LangType = keyof typeof LANGS;
export type LangTypeAndAuto = LangType | "auto";
export type TransItemType = keyof (typeof LANGS)["en"];
type TemplateVars = Record<
  string,
  string | number | boolean | null | undefined
>;

export class I18n {
  lang: LangTypeAndAuto;
  readonly saveSettingFunc: (tolang: LangTypeAndAuto) => Promise<void>;
  constructor(
    lang: LangTypeAndAuto,
    saveSettingFunc: (tolang: LangTypeAndAuto) => Promise<void>
  ) {
    this.lang = lang;
    this.saveSettingFunc = saveSettingFunc;
  }
  async changeTo(anotherLang: LangTypeAndAuto) {
    this.lang = anotherLang;
    await this.saveSettingFunc(anotherLang);
  }

  _get(key: TransItemType) {
    let realLang = this.lang;
    if (this.lang === "auto") {
      if (moment.locale().replace("-", "_") in LANGS) {
        realLang = moment.locale().replace("-", "_") as LangType;
      } else {
        realLang = "en";
      }
    } else if (this.lang in LANGS) {
      realLang = this.lang as LangType;
    } else {
      realLang = "en";
    }

    const res: string =
      (LANGS[realLang] as (typeof LANGS)["en"])[key] || LANGS["en"][key] || key;
    return res;
  }

  t(key: TransItemType, vars?: TemplateVars) {
    if (vars === undefined) {
      return this._get(key);
    }
    const normalizedVars = Object.fromEntries(
      Object.entries(vars).map(([key, value]) => [key, value == null ? "" : `${value}`])
    );
    return Mustache.render(this._get(key), normalizedVars);
  }
}
