import {
  BarChart3, ArrowLeftRight, Link2, Layers, Cable,
  GitBranch, ScrollText, Network, type LucideIcon,
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
