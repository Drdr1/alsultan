/* Phosphor icons (duotone) mapped to the names the app uses. */
import {
  WarningCircle, Warning, Archive as PArchive, ArrowRight as PArrowRight, Bell as PBell, BellRinging, CalendarCheck, CalendarBlank,
  Check as PCheck, CheckCircle, CaretLeft, ClipboardText, Clock as PClock, Receipt, House, SquaresFour, LockSimple, SignOut,
  MapPin as PMapPin, PencilSimpleLine, Phone as PPhone, Broadcast, MagnifyingGlass, ShieldCheck as PShieldCheck, Storefront,
  HandCoins, UserPlus as PUserPlus, UsersThree, Wallet as PWallet, X as PX, Lightning, Moon as PMoon, Sun as PSun, Export as PExport, GearSix,
} from '@phosphor-icons/react';

const w = (C, weight = 'duotone') => (p) => <C weight={weight} {...p} />;

export const AlertCircle = w(WarningCircle);
export const AlertTriangle = w(Warning);
export const Archive = w(PArchive);
export const ArrowRight = w(PArrowRight, 'bold');
export const Bell = w(PBell);
export const BellRing = w(BellRinging);
export const CalendarClock = w(CalendarCheck);
export const CalendarDays = w(CalendarBlank);
export const Check = w(PCheck, 'bold');
export const CheckCircle2 = w(CheckCircle);
export const ChevronLeft = w(CaretLeft, 'bold');
export const ClipboardCheck = w(ClipboardText);
export const Clock = w(PClock);
export const FileText = w(Receipt);
export const Home = w(House);
export const LayoutDashboard = w(SquaresFour);
export const Lock = w(LockSimple);
export const LogOut = w(SignOut);
export const MapPin = w(PMapPin);
export const PencilLine = w(PencilSimpleLine);
export const Phone = w(PPhone);
export const Radio = w(Broadcast);
export const Search = w(MagnifyingGlass, 'bold');
export const ShieldCheck = w(PShieldCheck);
export const Store = w(Storefront);
export const TrendingDown = w(HandCoins);
export const UserPlus = w(PUserPlus);
export const Users = w(UsersThree);
export const Wallet = w(PWallet);
export const X = w(PX, 'bold');
export const Zap = w(Lightning);

export const Moon = w(PMoon);
export const Sun = w(PSun);
export const ShareIcon = w(PExport, 'bold');
export const BellRingingIcon = w(BellRinging);
export const Settings = w(GearSix);
