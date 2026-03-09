import {
  BarChart3, ArrowLeftRight, Link2, Layers, Cable,
  GitBranch, ScrollText, Network,
  Users, KeyRound, Globe, SlidersHorizontal, Settings2, Flag, Database,
  Info, Shield, FileText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/",            label: "Dashboard",   icon: BarChart3 },
  { href: "/connections", label: "Connections", icon: Cable },
  { href: "/channels",    label: "Channels",    icon: GitBranch },
  { href: "/queues",      label: "Queues",      icon: Layers },
  { href: "/exchanges",   label: "Exchanges",   icon: ArrowLeftRight },
  { href: "/topology",    label: "Topology",    icon: Network },
  { href: "/policies",    label: "Policies",    icon: ScrollText },
  { href: "/bindings",    label: "Bindings",    icon: Link2 },
];

export const ADMIN_ITEMS: NavItem[] = [
  { href: "/users",         label: "Users",          icon: Users },
  { href: "/permissions",   label: "Permissions",    icon: KeyRound },
  { href: "/vhosts",        label: "Virtual Hosts",  icon: Globe },
  { href: "/limits",        label: "Vhost Limits",   icon: SlidersHorizontal },
  { href: "/parameters",    label: "Parameters",     icon: Settings2 },
  { href: "/feature-flags", label: "Feature Flags",  icon: Flag },
  { href: "/definitions",   label: "Definitions",    icon: Database },
];

export const FOOTER_ITEMS: NavItem[] = [
  { href: "/docs",    label: "About",   icon: Info },
  { href: "/privacy", label: "Privacy", icon: Shield },
  { href: "/terms",   label: "Terms",   icon: FileText },
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_ITEMS, ...ADMIN_ITEMS, ...FOOTER_ITEMS];
