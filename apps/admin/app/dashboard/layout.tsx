import BizSidebar from '../../components/BizSidebar';
import BizTopbar from '../../components/BizTopbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-cream-light overflow-hidden">
      <BizSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <BizTopbar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
