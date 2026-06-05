import { Phone, MessageCircle, Send, Mail, MessageSquare } from "lucide-react";
import {
  telHref,
  whatsappHref,
  telegramHref,
  maxMessengerHref,
  emailHref,
} from "@/lib/dispatcher/contacts";

interface Props {
  phone?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  max_messenger?: string | null;
  email?: string | null;
  className?: string;
}

export function ContactLinks({
  phone,
  whatsapp,
  telegram,
  max_messenger,
  email,
  className,
}: Props) {
  const items: { href: string; title: string; icon: React.ReactNode }[] = [];
  const tel = telHref(phone);
  if (tel) items.push({ href: tel, title: phone ?? "Телефон", icon: <Phone className="h-4 w-4" /> });
  const wa = whatsappHref(whatsapp ?? phone);
  if (wa) items.push({ href: wa, title: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> });
  const tg = telegramHref(telegram);
  if (tg) items.push({ href: tg, title: "Telegram", icon: <Send className="h-4 w-4" /> });
  const mx = maxMessengerHref(max_messenger);
  if (mx) items.push({ href: mx, title: "Max Messenger", icon: <MessageSquare className="h-4 w-4" /> });
  const em = emailHref(email);
  if (em) items.push({ href: em, title: email ?? "Email", icon: <Mail className="h-4 w-4" /> });

  if (!items.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      {items.map((it, i) => (
        <a
          key={i}
          href={it.href}
          title={it.title}
          target={it.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {it.icon}
        </a>
      ))}
    </div>
  );
}
