import {
  Folder,
  Code,
  BookOpen,
  Briefcase,
  Home,
  Star,
  Rocket,
  ShoppingCart,
  Wrench,
  Heart,
  Globe,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PresetIcon {
  name: string;
  icon: LucideIcon;
}

export const PRESET_ICONS: PresetIcon[] = [
  { name: "Folder", icon: Folder },
  { name: "Code", icon: Code },
  { name: "BookOpen", icon: BookOpen },
  { name: "Briefcase", icon: Briefcase },
  { name: "Home", icon: Home },
  { name: "Star", icon: Star },
  { name: "Rocket", icon: Rocket },
  { name: "ShoppingCart", icon: ShoppingCart },
  { name: "Wrench", icon: Wrench },
  { name: "Heart", icon: Heart },
  { name: "Globe", icon: Globe },
  { name: "Lightbulb", icon: Lightbulb },
];
