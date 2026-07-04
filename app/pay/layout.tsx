import TerminalChrome from "@/app/components/TerminalChrome";

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TerminalChrome />
      {children}
    </>
  );
}
