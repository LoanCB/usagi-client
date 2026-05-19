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
	"--destructive": string;
	"--chart-1": string;
	"--chart-2": string;
	"--chart-3": string;
	"--chart-4": string;
	"--chart-5": string;
	"--sidebar": string;
	"--sidebar-foreground": string;
	"--sidebar-primary": string;
	"--sidebar-primary-foreground": string;
	"--sidebar-accent": string;
	"--sidebar-accent-foreground": string;
	"--sidebar-border": string;
	"--sidebar-ring": string;
	"--radius": string;
	// Bunly-specific
	"--priority-high": string;
	"--priority-medium": string;
	"--priority-low": string;
	// Glassmorphism — per-theme computed values used in index.css
	"--app-gradient": string;
	"--orb-1-color": string;
	"--orb-2-color": string;
	"--orb-3-color": string;
	"--vignette-end-color": string;
	"--glass-border-color": string;
	"--glass-border-hover-color": string;
}

export interface Theme {
	name: string;
	tokens: ThemeTokens;
}

export type ThemeMode = "system" | "light" | "dark" | string;
