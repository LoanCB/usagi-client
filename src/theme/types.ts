export interface ThemeTokens {
  // shadcn/ui base tokens (values are CSS color strings)
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--border": string;
  "--input": string;
  "--ring": string;
  "--radius": string;
  // Usagi-specific
  "--priority-high": string;
  "--priority-medium": string;
  "--priority-low": string;
}

export interface Theme {
  name: string;
  tokens: ThemeTokens;
}

export type ThemeMode = "system" | "light" | "dark" | string;
