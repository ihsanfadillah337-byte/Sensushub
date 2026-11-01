import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, QrCode, Lock, Mail, Eye, EyeOff, UserPlus, LogIn, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";

export default function Auth() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      navigate("/dashboard/assets", { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email dan password wajib diisi.");
      return;
    }
    if (!isLogin && !companyName.trim()) {
      toast.error("Nama Instansi wajib diisi.");
      return;
    }

    setLoading(true);

    const { allowed, remainingMs } = await checkRateLimit(`login_${email.trim()}`);
    if (!allowed) {
      const minutes = Math.ceil(remainingMs / 60000);
      toast.error(`Terlalu banyak percobaan. Silakan coba lagi dalam ${minutes} menit.`);
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        resetRateLimit(`login_${email.trim()}`);
        toast.success("Login berhasil!");
        navigate("/dashboard/assets", { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { company_name: companyName.trim() },
          },
        });
        if (error) throw error;
        toast.success("Registrasi berhasil! Silakan cek email Anda untuk verifikasi.");
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const bkadImage = "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=modern%20two-story%20government%20building%20with%20beige%20and%20red%20facade%2C%20large%20windows%2C%20some%20trees%20in%20front%2C%20clear%20sky%2C%20professional%20architectural%20photography%2C%20Kabupaten%20Bandung%20office%20style&image_size=landscape_16_9";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] p-4 md:p-8">
      <div className="w-full max-w-6xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[650px] border border-slate-200/50">
        
        {/* Left Section: Branding & Image */}
        <div className="relative w-full md:w-1/2 min-h-[400px] md:min-h-full overflow-hidden">
          {/* Background Image with Gradient Overlay */}
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
            style={{ backgroundImage: `url(${bkadImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-white/95 via-white/70 to-white/10" />
          
          {/* Content Wrapper */}
          <div className="relative h-full p-8 md:p-12 flex flex-col">
            {/* Top Branding */}
            <div className="flex items-start gap-4 mb-auto">
              <div className="h-12 w-12 rounded-xl bg-white shadow-sm flex items-center justify-center border border-slate-100">
                <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">S</div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-800 tracking-tight">SIPPA-BMD</h2>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider border border-slate-200">v4.2 PRO</span>
                </div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest opacity-80">PEMERINTAH KABUPATEN BANDUNG</p>
              </div>
            </div>

            {/* Middle Content: Transformasi Digital */}
            <div className="my-auto max-w-md">
              <h1 className="text-4xl md:text-5xl font-black text-slate-800 leading-[1.1] mb-6 tracking-tight">
                Transformasi Digital <span className="text-blue-600">Tata Kelola</span> Aset Daerah
              </h1>
              <p className="text-lg text-slate-600 font-medium leading-relaxed mb-8 opacity-90">
                Platform rekonsiliasi, inventarisasi otomatis, dan audit real-time Barang Milik Daerah.
              </p>
            </div>

            {/* Bottom Left: Badges */}
            <div className="flex flex-wrap gap-3 mt-auto">
              <div className="flex items-center gap-2.5 bg-white/90 backdrop-blur-md border border-white px-4 py-2.5 rounded-2xl shadow-sm">
                <div className="h-6 w-6 rounded-lg bg-blue-50 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-xs font-bold text-slate-700">Akuntabel & Terintegrasi</span>
              </div>
              <div className="flex items-center gap-2.5 bg-white/90 backdrop-blur-md border border-white px-4 py-2.5 rounded-2xl shadow-sm">
                <div className="h-6 w-6 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <QrCode className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs font-bold text-slate-700">QR Code Otomatis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Form */}
        <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Portal SIPPA-BMD</h2>
              <p className="text-slate-500 font-medium text-sm">
                Akses terpadu pengelola aset & tim rekon BKAD Kab. Bandung.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="company-name" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Instansi / Perusahaan</Label>
                  <div className="relative">
                    <Input
                      id="company-name"
                      placeholder="Masukkan nama instansi"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={loading}
                      className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alamat Surel Kedinasan / NIP</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="nama@bandungkab.go.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kata Sandi Portal</Label>
                  <button type="button" className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">Lupa Password?</button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pl-10 pr-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-all font-medium"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="remember" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="remember" className="text-xs font-bold text-slate-600 cursor-pointer">Ingat kredensial di perangkat ini</label>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Lock className="h-3 w-3" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">SSL 256-Bit</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Button type="submit" className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 group" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {isLogin ? "Masuk ke Sistem" : "Buat Akun Sekarang"}
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </Button>

                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsLogin(!isLogin)}
                  className="w-full h-12 rounded-xl border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  {isLogin ? (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Daftarkan Akun
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Kembali ke Login
                    </>
                  )}
                </Button>
              </div>
            </form>

            <div className="pt-8 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                &copy; 2024 BKAD KABUPATEN BANDUNG • SIPPA-BMD
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
