"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiRequest } from "@/lib/api-client";

/**
 * Intercepts browser back-button navigation when the user is logged in,
 * asking them to confirm whether they want to log out or stay on the current page.
 */
export function BackLogoutModal() {
  const { user: currentUser } = useCurrentUser();
  const isSignedIn = !!currentUser;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;

    // Push an initial history state entry to trap the back button press
    window.history.pushState({ dealflow_auth_guard: true }, "", window.location.href);

    const handlePopState = () => {
      // Prevent exiting and re-push state to trap future back clicks
      window.history.pushState({ dealflow_auth_guard: true }, "", window.location.href);
      setIsOpen(true);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isSignedIn]);

  if (!isOpen) return null;

  async function handleConfirmLogout() {
    setIsLoggingOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  function handleCancel() {
    setIsOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
    >
      <Card className="w-full max-w-md border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        <CardHeader className="pb-3 text-center sm:text-left">
          <div className="mx-auto sm:mx-0 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
            <LogOut className="h-6 w-6" />
          </div>
          <CardTitle id="logout-dialog-title" className="text-xl font-bold text-foreground">
            Do you want to log out?
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1.5">
            You clicked the browser back button. Would you like to log out of your DealFlow360 account, or stay on this page?
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4 pt-1">
          <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <span>
              Choosing <strong>Yes</strong> will securely terminate your active session and return you to the sign-in screen.
            </span>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoggingOut}
            className="w-full sm:w-auto font-medium"
          >
            No, Stay
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmLogout}
            disabled={isLoggingOut}
            className="w-full sm:w-auto font-medium shadow-xs"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging out…
              </>
            ) : (
              "Yes, Log Out"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
