/** Sources shown in filter dropdowns — live App Store + Play Store only. */
export const UI_FILTER_SOURCES = ["app_store", "play_store"] as const;

export type UiFilterSource = (typeof UI_FILTER_SOURCES)[number];
