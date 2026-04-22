import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PillIcon } from '@/components/PillIcon';
import { RoleSelector, UserRole } from '@/components/RoleSelector';
import { toast } from 'sonner';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Heart, ArrowLeft } from 'lucide-react';
import { BiometricPrompt } from '@/components/BiometricPrompt';
import { BiometricUnlock } from '@/components/BiometricUnlock';
import {
  isBiometricEnabled,
  isBiometricUnlocked,
  lockBiometricSession,
  markBiometricUnlocked,
  shouldAskForBiometric,
} from '@/hooks/useBiometric';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const nameSchema = z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long');

type AuthStep = 'role-select' | 'credentials';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<AuthStep>('role-select');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; fullName?: string }>({});
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);

  const { signIn, signUp, signOut, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && !showBiometricPrompt) {
      if (isBiometricEnabled() && !isBiometricUnlocked() && !showPasswordLogin) {
        return;
      }
      // Check if user is caregiver and redirect accordingly
      checkUserRoleAndRedirect(user.id);
    }
  }, [user, loading, navigate, showBiometricPrompt, showPasswordLogin]);

  const checkUserRoleAndRedirect = async (userId: string) => {
    // Check localStorage for the role selected during login/signup
    const selectedRoleFromStorage = localStorage.getItem("selected_role");
    
    if (selectedRoleFromStorage === "caregiver") {
      navigate('/');
    } else {
      navigate('/');
    }
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string; fullName?: string } = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (!isLogin) {
      const nameResult = nameSchema.safeParse(fullName);
      if (!nameResult.success) {
        newErrors.fullName = nameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Invalid email or password');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Welcome back!');
          if (shouldAskForBiometric()) {
            setShowBiometricPrompt(true);
            setPendingRedirect(true);
          } else {
            markBiometricUnlocked();
          }
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast.error('An account with this email already exists');
          } else {
            toast.error(error.message);
          }
        } else {
          // If signup is for caregiver, we need to add the role
          if (selectedRole === 'caregiver') {
            // The user will be created with 'patient' role by default
            // We need to add caregiver role after signup
            toast.success('Account created! You can now access the caregiver dashboard.');
          } else {
            toast.success('Account created successfully!');
          }
          if (shouldAskForBiometric()) {
            setShowBiometricPrompt(true);
            setPendingRedirect(true);
          } else {
            markBiometricUnlocked();
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    // Store the selected role so Index can use it
    localStorage.setItem("selected_role", role);
    setStep('credentials');
  };

  const handleBackToRoleSelect = () => {
    setStep('role-select');
    setSelectedRole(null);
    setErrors({});
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setStep('role-select');
    setSelectedRole(null);
    setErrors({});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-medical-light/10">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <PillIcon className="w-12 h-12 text-primary" />
        </motion.div>
      </div>
    );
  }

  if (user && isBiometricEnabled() && !isBiometricUnlocked() && !showPasswordLogin && !showBiometricPrompt) {
    return (
      <BiometricUnlock
        userName={user.user_metadata?.full_name || user.email}
        onUnlocked={() => {
          markBiometricUnlocked();
          checkUserRoleAndRedirect(user.id);
        }}
        onUsePassword={async () => {
          lockBiometricSession();
          setShowPasswordLogin(true);
          await signOut();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background via-background to-medical-light/10">
      {user && (
        <BiometricPrompt
          open={showBiometricPrompt}
          userId={user.id}
          userName={user.email}
          displayName={user.user_metadata?.full_name || user.email}
          onComplete={() => {
            setShowBiometricPrompt(false);
            if (pendingRedirect) {
              checkUserRoleAndRedirect(user.id);
            }
          }}
        />
      )}
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-48 h-48 bg-medical-accent/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 mb-4"
          >
            <PillIcon className="w-8 h-8 text-primary-foreground" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">Smart Medicine Reminder</h1>
          <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1">
            Your health companion <Heart className="w-4 h-4 text-medical-warning fill-medical-warning" />
          </p>
        </div>

        <Card className="border-border/50 shadow-xl shadow-black/5">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center gap-2">
              {step === 'credentials' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleBackToRoleSelect}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div className="flex-1">
                <CardTitle className="text-xl">
                  {isLogin ? 'Welcome back' : 'Create account'}
                </CardTitle>
                <CardDescription>
                  {step === 'role-select'
                    ? isLogin
                      ? 'Select how you want to sign in'
                      : 'Choose your account type to get started'
                    : isLogin
                    ? `Sign in as ${selectedRole === 'caregiver' ? 'Caregiver' : 'Patient'}`
                    : `Create your ${selectedRole === 'caregiver' ? 'Caregiver' : 'Patient'} account`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AnimatePresence mode="wait">
              {step === 'role-select' ? (
                <motion.div
                  key="role-select"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <RoleSelector
                    onSelect={handleRoleSelect}
                    mode={isLogin ? 'login' : 'signup'}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="credentials"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AnimatePresence mode="wait">
                      {!isLogin && (
                        <motion.div
                          key="fullName"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="space-y-2">
                            <Label htmlFor="fullName">Full Name</Label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                id="fullName"
                                type="text"
                                placeholder="John Doe"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="pl-10"
                                disabled={isSubmitting}
                              />
                            </div>
                            {errors.fullName && (
                              <p className="text-sm text-destructive">{errors.fullName}</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10"
                          disabled={isSubmitting}
                        />
                      </div>
                      {errors.email && (
                        <p className="text-sm text-destructive">{errors.email}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-10"
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="text-sm text-destructive">{errors.password}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full group"
                      size="lg"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                        />
                      ) : (
                        <>
                          {isLogin ? 'Sign In' : 'Create Account'}
                          <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLogin ? (
                  <>
                    Don't have an account?{' '}
                    <span className="text-primary font-medium">Sign up</span>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <span className="text-primary font-medium">Sign in</span>
                  </>
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}
