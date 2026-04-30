import {
  // Status / boolean
  CheckIcon, XIcon, CheckCircle2Icon, CircleIcon, XCircleIcon,
  AlertTriangleIcon, AlertCircleIcon, InfoIcon,
  // Navigation / disclosure
  ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronsLeftIcon, ChevronsRightIcon,
  ArrowUpIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon,
  // CRUD / actions
  PlusIcon, MinusIcon, PencilIcon, Trash2Icon, CopyIcon,
  EyeIcon, EyeOffIcon, SaveIcon, SendIcon, RefreshCwIcon,
  ArchiveIcon, DownloadIcon, UploadIcon, SearchIcon, FilterIcon,
  // Common nouns
  UserIcon, UsersIcon, FileIcon, FileTextIcon, FilesIcon,
  FolderIcon, FolderOpenIcon, ImageIcon, LinkIcon, MailIcon,
  CalendarIcon, ClockIcon, BellIcon, InboxIcon, StarIcon,
  HomeIcon, SettingsIcon, ShieldIcon, ShieldCheckIcon, KeyIcon,
  LockIcon, UnlockIcon, GlobeIcon, MapPinIcon, PhoneIcon,
  // Tags / labels
  TagIcon, TagsIcon, BookmarkIcon, FlagIcon, HashIcon,
  // Money / data
  DollarSignIcon, CreditCardIcon, ShoppingCartIcon, PackageIcon,
  TrendingUpIcon, TrendingDownIcon, BarChartIcon, PieChartIcon,
  ActivityIcon, DatabaseIcon, ServerIcon,
  // Communication
  MessageSquareIcon, MessageCircleIcon, AtSignIcon,
  // Misc
  MoreHorizontalIcon, MoreVerticalIcon, MenuIcon,
  ExternalLinkIcon, PaperclipIcon, PrinterIcon, ShareIcon,
  HeartIcon, ThumbsUpIcon, ThumbsDownIcon, AwardIcon,
  ZapIcon, SparklesIcon, FlameIcon, SunIcon, MoonIcon,
  PlayIcon, PauseIcon, StopCircleIcon, SkipBackIcon, SkipForwardIcon,
  RotateCwIcon, RotateCcwIcon, MaximizeIcon, MinimizeIcon,
  EditIcon, ClipboardIcon, ListIcon, GridIcon, LayoutDashboardIcon,
  NewspaperIcon, BookIcon, GraduationCapIcon, BriefcaseIcon, BuildingIcon,
  CarIcon, TruckIcon, PlaneIcon, RocketIcon,
  CodeIcon, TerminalIcon, GitBranchIcon, GitPullRequestIcon, BugIcon,
  HelpCircleIcon, LifeBuoyIcon, MegaphoneIcon, PuzzleIcon,
  PaletteIcon, BrushIcon, TypeIcon,
} from 'lucide-react'
import type { IconMap } from './registry.js'

/**
 * Curated lucide baseline (~150 icons) for admin-panel use. Spread into
 * `registerIcons()` for users who don't want to pick icons one by one.
 *
 * Canonical names are kebab-case (`'check-circle'`, not `'checkCircle'`).
 * Multiple aliases land on the same component (`'check-circle'` and
 * `'check-circle-2'` → `CheckCircle2Icon`) for migration / convenience.
 *
 * @example
 *   import { registerIcons } from '@pilotiq/pilotiq/icons'
 *   import { lucideIcons } from '@pilotiq/pilotiq/icons/lucide'
 *   registerIcons(lucideIcons)
 */
export const lucideIcons: IconMap = {
  // Status / boolean
  'check':              CheckIcon,
  'x':                  XIcon,
  'check-circle':       CheckCircle2Icon,
  'check-circle-2':     CheckCircle2Icon,
  'circle':             CircleIcon,
  'x-circle':           XCircleIcon,
  'alert-triangle':     AlertTriangleIcon,
  'alert-circle':       AlertCircleIcon,
  'info':               InfoIcon,

  // Navigation / disclosure
  'chevron-down':       ChevronDownIcon,
  'chevron-up':         ChevronUpIcon,
  'chevron-left':       ChevronLeftIcon,
  'chevron-right':      ChevronRightIcon,
  'chevrons-left':      ChevronsLeftIcon,
  'chevrons-right':     ChevronsRightIcon,
  'arrow-up':           ArrowUpIcon,
  'arrow-down':         ArrowDownIcon,
  'arrow-left':         ArrowLeftIcon,
  'arrow-right':        ArrowRightIcon,

  // CRUD / actions
  'plus':               PlusIcon,
  'minus':              MinusIcon,
  'pencil':             PencilIcon,
  'edit':               EditIcon,
  'trash':              Trash2Icon,
  'trash-2':            Trash2Icon,
  'copy':               CopyIcon,
  'eye':                EyeIcon,
  'eye-off':            EyeOffIcon,
  'save':               SaveIcon,
  'send':               SendIcon,
  'refresh':            RefreshCwIcon,
  'refresh-cw':         RefreshCwIcon,
  'archive':            ArchiveIcon,
  'download':           DownloadIcon,
  'upload':             UploadIcon,
  'search':             SearchIcon,
  'filter':             FilterIcon,

  // Common nouns
  'user':               UserIcon,
  'users':              UsersIcon,
  'file':               FileIcon,
  'file-text':          FileTextIcon,
  'files':              FilesIcon,
  'folder':             FolderIcon,
  'folder-open':        FolderOpenIcon,
  'image':              ImageIcon,
  'link':               LinkIcon,
  'mail':               MailIcon,
  'calendar':           CalendarIcon,
  'clock':              ClockIcon,
  'bell':               BellIcon,
  'inbox':              InboxIcon,
  'star':               StarIcon,
  'home':               HomeIcon,
  'settings':           SettingsIcon,
  'shield':             ShieldIcon,
  'shield-check':       ShieldCheckIcon,
  'key':                KeyIcon,
  'lock':               LockIcon,
  'unlock':             UnlockIcon,
  'globe':              GlobeIcon,
  'map-pin':            MapPinIcon,
  'phone':              PhoneIcon,

  // Tags / labels
  'tag':                TagIcon,
  'tags':               TagsIcon,
  'bookmark':           BookmarkIcon,
  'flag':               FlagIcon,
  'hash':               HashIcon,

  // Money / data
  'dollar-sign':        DollarSignIcon,
  'credit-card':        CreditCardIcon,
  'shopping-cart':      ShoppingCartIcon,
  'package':            PackageIcon,
  'trending-up':        TrendingUpIcon,
  'trending-down':      TrendingDownIcon,
  'bar-chart':          BarChartIcon,
  'pie-chart':          PieChartIcon,
  'activity':           ActivityIcon,
  'database':           DatabaseIcon,
  'server':             ServerIcon,

  // Communication
  'message-square':     MessageSquareIcon,
  'message-circle':     MessageCircleIcon,
  'at-sign':            AtSignIcon,

  // Misc
  'more-horizontal':    MoreHorizontalIcon,
  'more-vertical':      MoreVerticalIcon,
  'menu':               MenuIcon,
  'external-link':      ExternalLinkIcon,
  'paperclip':          PaperclipIcon,
  'printer':            PrinterIcon,
  'share':              ShareIcon,
  'heart':              HeartIcon,
  'thumbs-up':          ThumbsUpIcon,
  'thumbs-down':        ThumbsDownIcon,
  'award':              AwardIcon,
  'zap':                ZapIcon,
  'sparkles':           SparklesIcon,
  'flame':              FlameIcon,
  'sun':                SunIcon,
  'moon':               MoonIcon,
  'play':               PlayIcon,
  'pause':              PauseIcon,
  'stop':               StopCircleIcon,
  'stop-circle':        StopCircleIcon,
  'skip-back':          SkipBackIcon,
  'skip-forward':       SkipForwardIcon,
  'rotate-cw':          RotateCwIcon,
  'rotate-ccw':         RotateCcwIcon,
  'maximize':           MaximizeIcon,
  'minimize':           MinimizeIcon,
  'clipboard':          ClipboardIcon,
  'list':               ListIcon,
  'grid':               GridIcon,
  'layout-dashboard':   LayoutDashboardIcon,
  'newspaper':          NewspaperIcon,
  'book':               BookIcon,
  'graduation-cap':     GraduationCapIcon,
  'briefcase':          BriefcaseIcon,
  'building':           BuildingIcon,
  'car':                CarIcon,
  'truck':              TruckIcon,
  'plane':              PlaneIcon,
  'rocket':             RocketIcon,
  'code':               CodeIcon,
  'terminal':           TerminalIcon,
  'git-branch':         GitBranchIcon,
  'git-pull-request':   GitPullRequestIcon,
  'bug':                BugIcon,
  'help-circle':        HelpCircleIcon,
  'life-buoy':          LifeBuoyIcon,
  'megaphone':          MegaphoneIcon,
  'puzzle':             PuzzleIcon,
  'palette':            PaletteIcon,
  'brush':              BrushIcon,
  'type':               TypeIcon,
}
