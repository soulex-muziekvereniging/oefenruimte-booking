// Het beheerpaneel blijft licht: het is een werkscherm met veel lijsten en tekst. De
// achtergrond van <main> wordt via .admin-shell licht gemaakt (zie globals.css).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell text-gray-900">{children}</div>;
}
