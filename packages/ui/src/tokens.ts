export const colors = {
  primary: '#5C3D2E',
  primaryDark: '#3B2314',
  primaryWarm: '#7A5230',
  cream: '#F5ECD7',
  creamLight: '#FAF6EE',
  creamDark: '#EAD9BA',
  textPrimary: '#3B2314',
  textSecondary: '#7A5230',
  textInverse: '#FAF6EE',
  success: '#4A7C59',
  warning: '#C97D2E',
  danger: '#A63C2E',
} as const;

export const spacing = [0, 4, 8, 16, 24, 32, 48, 64, 96, 128] as const;

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '16px',
  pill: '9999px',
} as const;

export const fonts = {
  heading: "'Playfair Display', serif",
  body: "'Inter', sans-serif",
} as const;
