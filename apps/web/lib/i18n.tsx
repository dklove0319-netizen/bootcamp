// 문구 배급기 — 레이아웃(서버)이 정한 언어를 받아, 모든 화면에 해당 언어의 문구 묶음을 나눠준다.
// 화면 코드는 useMessages() 하나만 부르면 된다 — ko/en 분기를 화면마다 두지 않는다.
"use client";
import { createContext, useContext } from "react";
import ko from "../messages/ko.json";
import en from "../messages/en.json";
import type { Locale } from "./locale";

export type Messages = typeof ko;

const MESSAGES: Record<Locale, Messages> = { ko, en };
const LocaleContext = createContext<Messages>(ko);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={MESSAGES[locale]}>{children}</LocaleContext.Provider>;
}

export function useMessages(): Messages {
  return useContext(LocaleContext);
}
