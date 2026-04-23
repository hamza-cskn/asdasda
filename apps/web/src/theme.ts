import { createTheme, defaultVariantColorsResolver, type MantineThemeOverride } from "@mantine/core";

const variantColorResolver: MantineThemeOverride["variantColorResolver"] = (input) => {
  const defaults = defaultVariantColorsResolver(input);

  if (input.variant === "light") {
    return {
      ...defaults,
      background: "rgba(24, 100, 171, 0.08)",
      hover: "rgba(24, 100, 171, 0.14)",
      color: "#16476f",
      border: "transparent"
    };
  }

  return defaults;
};

export const asysTheme = createTheme({
  primaryColor: "ocean",
  primaryShade: 6,
  fontFamily: "'Sora', 'IBM Plex Sans', 'Segoe UI', sans-serif",
  headings: {
    fontFamily: "'Space Grotesk', 'Sora', sans-serif",
    fontWeight: "700"
  },
  radius: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.25rem",
    xl: "1.6rem"
  },
  colors: {
    ocean: [
      "#ecf4ff",
      "#d4e7ff",
      "#a8cdff",
      "#7ab3ff",
      "#4a97ff",
      "#237ffd",
      "#1267e3",
      "#0f52b2",
      "#0f438d",
      "#133e72"
    ],
    ember: [
      "#fff1e8",
      "#ffe1d1",
      "#ffc2a2",
      "#ffa173",
      "#ff8449",
      "#ff6f2f",
      "#f6611f",
      "#db4e12",
      "#af3b10",
      "#8d3312"
    ]
  },
  defaultRadius: "md",
  defaultGradient: {
    from: "ocean.6",
    to: "ember.5",
    deg: 120
  },
  variantColorResolver
});
