// Shared UI components, hooks, and utilities

// Hooks
export { useIsMobile } from "./hooks/use-mobile";
export { toast, useToast } from "./hooks/use-toast";

// Utilities
export { cn } from "./lib/utils";

// SafeImage
export { SafeImage } from "./components/ui/SafeImage";
export type { SafeImageProps } from "./components/ui/SafeImage";

// Accordion
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion";

// Alert
export { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";

// Alert Dialog
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog";

// Aspect Ratio
export { AspectRatio } from "./components/ui/aspect-ratio";

// Avatar
export { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";

// Badge
export { Badge, badgeVariants } from "./components/ui/badge";
export type { BadgeProps } from "./components/ui/badge";

// Breadcrumb
export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./components/ui/breadcrumb";

// Button
export { Button, buttonVariants } from "./components/ui/button";
export type { ButtonProps } from "./components/ui/button";

// Button Group
export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
} from "./components/ui/button-group";

// Calendar
export { Calendar, CalendarDayButton } from "./components/ui/calendar";

// Card
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";

// Carousel
export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./components/ui/carousel";
export type { CarouselApi } from "./components/ui/carousel";

// Chart
export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "./components/ui/chart";
export type { ChartConfig } from "./components/ui/chart";

// Checkbox
export { Checkbox } from "./components/ui/checkbox";

// Collapsible
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";

// Command
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./components/ui/command";

// Context Menu
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/ui/context-menu";

// Dialog
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";

// Drawer
export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "./components/ui/drawer";

// Dropdown Menu
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";

// Empty State
export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty";

// Field
export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "./components/ui/field";

// Form
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "./components/ui/form";

// Hover Card
export { HoverCard, HoverCardContent, HoverCardTrigger } from "./components/ui/hover-card";

// Input
export { Input } from "./components/ui/input";

// Input Group
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./components/ui/input-group";

// Input OTP
export {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "./components/ui/input-otp";

// Item
export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./components/ui/item";

// Kbd
export { Kbd, KbdGroup } from "./components/ui/kbd";

// Label
export { Label } from "./components/ui/label";

// Menubar
export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "./components/ui/menubar";

// Navigation Menu
export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "./components/ui/navigation-menu";

// Pagination
export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./components/ui/pagination";

// Popover
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./components/ui/popover";

// Progress
export { Progress } from "./components/ui/progress";

// Radio Group
export { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";

// Resizable
export { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";

// Scroll Area
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area";

// Select
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";

// Separator
export { Separator } from "./components/ui/separator";

// Sheet
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";

// Sidebar
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar";

// Skeleton
export { Skeleton } from "./components/ui/skeleton";

// Slider
export { Slider } from "./components/ui/slider";

// Sonner (aliased to avoid collision with shadcn Toaster)
export { Toaster as SonnerToaster } from "./components/ui/sonner";

// Spinner / LoadingSpinner
export { Spinner } from "./components/ui/spinner";

// Switch
export { Switch } from "./components/ui/switch";

// Table
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";

// Tabs
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

// Textarea
export { Textarea } from "./components/ui/textarea";

// Toast (shadcn radix-based)
export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./components/ui/toast";
export type { ToastActionElement, ToastProps } from "./components/ui/toast";

// Toaster (renders active toasts via useToast hook)
export { Toaster } from "./components/ui/toaster";

// Toggle
export { Toggle, toggleVariants } from "./components/ui/toggle";

// Toggle Group
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";

// Tooltip
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
