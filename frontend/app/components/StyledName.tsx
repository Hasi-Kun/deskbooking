"use client";

type Props = {
  name: string;
  style?: string;              // "plain" | "glitter" | "particles"
  color?: string;               // Hex, z.B. "#35E0C0"
  className?: string;
};

/**
 * Rendert einen Nutzernamen im gewählten Stil. "glitter" nutzt die lokal
 * mitgelieferte Textur unter /sparkles/white.gif (siehe .styled-name-glitter
 * in globals.css) - bewusst kein Fremd-Host, das GIF liegt im Projekt.
 * "particles" ist ein pulsierendes Glühen per CSS-Keyframes (kein Bild,
 * daher leichtgewichtiger).
 */
export default function StyledName({ name, style = "plain", color, className = "" }: Props) {
  if (style === "glitter") {
    return (
      <span
        className={`styled-name-glitter ${className}`}
        style={color ? ({ "--glitter-base": color } as React.CSSProperties) : undefined}
      >
        {name}
      </span>
    );
  }
  if (style === "particles") {
    return (
      <span
        className={`styled-name-particles font-semibold ${className}`}
        style={color ? { color } : undefined}
      >
        {name}
      </span>
    );
  }
  return <span className={className}>{name}</span>;
}
