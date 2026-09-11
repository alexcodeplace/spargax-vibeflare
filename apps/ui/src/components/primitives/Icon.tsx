import {
  AlertCircle,
  BarChart2,
  Check,
  Download,
  ExternalLink,
  File,
  Github,
  Home,
  Image,
  Info,
  Key,
  KeyRound,
  MessageSquare,
  Mic,
  Moon,
  Send,
  Settings,
  Square,
  Star,
  Sun,
  Trash2,
  Upload,
  User,
  Zap,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { Icon as AstryxIcon } from '@astryxdesign/core/Icon';

const ICONS = {
  AlertCircle,
  BarChart2,
  Check,
  Download,
  ExternalLink,
  File,
  Github,
  Home,
  Image,
  Info,
  Key,
  KeyRound,
  MessageSquare,
  Mic,
  Moon,
  Send,
  Settings,
  Square,
  Star,
  Sun,
  Trash2,
  Upload,
  User,
  Zap,
} as const;

export type IconName = keyof typeof ICONS;
export interface IconProps extends Omit<LucideProps, 'size' | 'color'> {
  name: IconName;
  size?: 'sm' | 'md' | 'lg';
}

/** Every application glyph passes through Astryx Icon for sizing/theming/a11y. */
export function Icon({ name, size = 'md', className, 'aria-label': ariaLabel, ...rest }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <AstryxIcon
      icon={Glyph}
      size={size}
      className={className}
      label={typeof ariaLabel === 'string' ? ariaLabel : undefined}
      {...rest}
    />
  );
}
