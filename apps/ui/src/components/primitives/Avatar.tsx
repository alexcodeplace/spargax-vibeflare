import { Avatar as AstryxAvatar } from '@astryxdesign/core/Avatar';

export interface AvatarProps {
  src?: string;
  alt?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ src, alt, initials, size = 'md', className }: AvatarProps) {
  const name = alt || initials || 'User';
  return <AstryxAvatar src={src} alt={alt} name={name} size={size} className={className} />;
}
