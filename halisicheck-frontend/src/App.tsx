import { Route, Routes } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Navbar } from "@/components/common/Navbar"
import { DashboardPage } from "@/routes/DashboardPage"
import { MediaReportPage } from "@/routes/MediaReportPage"
import { NotFoundPage } from "@/routes/NotFoundPage"
import { ReportPage } from "@/routes/ReportPage"
import { RewritePage } from "@/routes/RewritePage"
import { UploadPage } from "@/routes/UploadPage"
import { LoginPage } from "@/routes/LoginPage"

function App() {
  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-svh flex-col">
        <Navbar />
        <main className="flex-1 px-4 py-8 sm:px-6">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/report/:jobId" element={<ReportPage />} />
            <Route path="/rewrite/:jobId" element={<RewritePage />} />
            <Route path="/media/:jobId" element={<MediaReportPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <footer className="border-t px-4 py-5 text-center text-xs text-muted-foreground sm:px-6">
          HalisiCheck — from the Swahili <em>halisi</em>, genuine. Detection
          results are likelihoods, never verdicts.
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
