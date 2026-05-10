import type { MDXComponents } from 'mdx/types';
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  MotionDiv,
  MotionStagger,
  MotionStaggerItem,
  MotionCard,
  MotionBadge,
  MotionHeader,
  MotionInlineCode,
  MotionTable,
  MotionPre,
  MotionBlockquote,
  FlowStep,
  FlowList,
  RefreshTokenFlow,
  ArchitectureFlow,
  BulkheadFlow,
} from './MotionComponents';

export function useMdxComponents(): MDXComponents {
  return {
    h1: ({ className, children, ...props }) => (
      <MotionHeader
        as="h1"
        className={cn(
          'scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl',
          className
        )}
        {...props}
      >
        {children}
      </MotionHeader>
    ),
    h2: ({ className, children, ...props }) => (
      <MotionHeader
        as="h2"
        className={cn(
          'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0',
          className
        )}
        {...props}
      >
        {children}
      </MotionHeader>
    ),
    h3: ({ className, children, ...props }) => (
      <MotionHeader
        as="h3"
        className={cn(
          'scroll-m-20 text-2xl font-semibold tracking-tight',
          className
        )}
        {...props}
      >
        {children}
      </MotionHeader>
    ),
    h4: ({ className, children, ...props }) => (
      <MotionHeader
        as="h4"
        className={cn(
          'scroll-m-20 text-xl font-semibold tracking-tight',
          className
        )}
        {...props}
      >
        {children}
      </MotionHeader>
    ),
    p: ({ className, children, ...props }) => (
      <MotionDiv
        className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}
        {...props}
      >
        {children}
      </MotionDiv>
    ),
    ul: ({ className, children, ...props }) => (
      <MotionStagger
        as="ul"
        className={cn('my-6 ml-6 list-disc [&>li]:mt-2', className)}
        {...props}
      >
        {children}
      </MotionStagger>
    ),
    ol: ({ className, children, ...props }) => (
      <MotionStagger
        as="ol"
        className={cn('my-6 ml-6 list-decimal [&>li]:mt-2', className)}
        {...props}
      >
        {children}
      </MotionStagger>
    ),
    li: ({ className, children, ...props }) => (
      <MotionStaggerItem className={cn(className)} {...props}>
        {children}
      </MotionStaggerItem>
    ),
    code: ({ className, children, ...props }) => (
      <MotionInlineCode className={cn(className)} {...props}>
        {children}
      </MotionInlineCode>
    ),
    pre: ({ className, children, ...props }) => (
      <MotionPre className={cn(className)} {...props}>
        {children}
      </MotionPre>
    ),
    blockquote: ({ className, children, ...props }) => (
      <MotionBlockquote className={cn(className)} {...props}>
        {children}
      </MotionBlockquote>
    ),
    a: ({ className, children, ...props }) => (
      <a
        className={cn('font-medium text-primary underline underline-offset-4', className)}
        {...props}
      >
        {children}
      </a>
    ),
    hr: (props) => <Separator className="my-8" {...props} />,
    table: ({ className, children, ...props }) => (
      <MotionTable className={cn(className)} {...props}>
        {children}
      </MotionTable>
    ),
    th: ({ className, children, ...props }) => (
      <th
        className={cn('border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right', className)}
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ className, children, ...props }) => (
      <td
        className={cn('border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right', className)}
        {...props}
      >
        {children}
      </td>
    ),
    // ── Componentes shadcn envueltos en animación ──
    Card: ({ className, children, ...props }) => (
      <MotionCard className={cn(className)} {...props}>
        {children}
      </MotionCard>
    ),
    Badge: ({ className, children, ...props }) => (
      <MotionBadge className={cn(className)} {...props}>
        {children}
      </MotionBadge>
    ),
    Alert: ({ className, children, ...props }) => (
      <MotionDiv className={cn(className)} {...props}>
        <Alert>{children}</Alert>
      </MotionDiv>
    ),
    Tabs: ({ className, children, ...props }) => (
      <MotionDiv className={cn(className)} {...props}>
        <Tabs>{children}</Tabs>
      </MotionDiv>
    ),
  };
}

export {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TabsContent,
  TabsList,
  TabsTrigger,
  AlertDescription,
  AlertTitle,
  // Componentes animados exportables para uso directo en MDX
  MotionDiv,
  MotionCard,
  MotionBadge,
  MotionStagger,
  MotionStaggerItem,
  MotionHeader,
  MotionInlineCode,
  MotionTable,
  MotionPre,
  MotionBlockquote,
  FlowStep,
  FlowList,
  RefreshTokenFlow,
  ArchitectureFlow,
  BulkheadFlow,
};
