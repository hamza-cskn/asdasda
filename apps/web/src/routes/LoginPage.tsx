import { FormEvent, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBuildingEstate,
  IconCircleCheck,
  IconLogin2,
  IconMailForward
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

import { forgotPassword, login } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { roleRouteMap } from "../auth/route-access";
import { webEnv } from "../config";
import { toUserMessage } from "../lib/error-utils";

type FormFeedback =
  | {
      kind: "error" | "info";
      message: string;
    }
  | null;

export function LoginPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [email, setEmail] = useState("admin@asys.local");
  const [password, setPassword] = useState("AsysDemo1234!");
  const [forgotEmail, setForgotEmail] = useState("resident@asys.local");
  const [loginFeedback, setLoginFeedback] = useState<FormFeedback>(null);
  const [forgotFeedback, setForgotFeedback] = useState<FormFeedback>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginFeedback(null);
    setIsSubmitting(true);

    try {
      const session = await login({
        email,
        password
      });

      setSession(session);
      navigate(roleRouteMap[session.user.role]);
    } catch (error) {
      setLoginFeedback({
        kind: "error",
        message: toUserMessage(error, "Giris formu gonderilemedi. Lutfen tekrar deneyin.")
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotFeedback(null);
    setIsForgotSubmitting(true);

    try {
      await forgotPassword({ email: forgotEmail });
      setForgotFeedback({
        kind: "info",
        message: "Sifre sifirlama adimlari e-posta kutunuza gonderildi."
      });
    } catch (error) {
      setForgotFeedback({
        kind: "error",
        message: toUserMessage(error, "Sifremi unuttum formu gonderilemedi.")
      });
    } finally {
      setIsForgotSubmitting(false);
    }
  }

  return (
    <main className="auth-page" data-testid="login-page">
      <Paper className="auth-card" radius="xl" withBorder shadow="xl" p={{ base: "lg", sm: "xl" }}>
        <Stack gap="lg">
          <Stack align="center" gap="xs">
            <ThemeIcon variant="gradient" size={52} radius="xl">
              <IconBuildingEstate size={26} />
            </ThemeIcon>
            <Title order={1} ta="center" style={{ fontSize: "1.6rem" }}>ASYS Giris</Title>
            <Text c="dimmed" ta="center" size="sm">
              Apartman Site Yonetim Sistemi'ne hos geldiniz.
              <br />
              E-posta ve sifre ile oturum acin.
            </Text>
          </Stack>

          <form onSubmit={onSubmit} className="auth-form">
            <TextInput
              id="email"
              data-testid="login-email"
              label="E-posta"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              size="md"
            />

            <PasswordInput
              id="password"
              data-testid="login-password"
              label="Sifre"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              required
              size="md"
            />

            <Button
              type="submit"
              data-testid="login-submit"
              disabled={isSubmitting}
              leftSection={<IconLogin2 size={16} />}
              fullWidth
              size="md"
              mt="xs"
            >
              {isSubmitting ? "Giris kontrol ediliyor..." : "Giris Yap"}
            </Button>
            {loginFeedback ? (
              <Alert
                variant="light"
                color={loginFeedback.kind === "error" ? "red" : "teal"}
                icon={loginFeedback.kind === "error" ? <IconAlertCircle size={16} /> : <IconCircleCheck size={16} />}
                data-testid="login-form-feedback"
              >
                {loginFeedback.message}
              </Alert>
            ) : null}
          </form>

          <Divider label="Sifremi Unuttum" labelPosition="center" />

          <form onSubmit={onForgotPassword} className="auth-form forgot-form">
            <TextInput
              id="forgotEmail"
              data-testid="forgot-email"
              label="Sifremi Unuttum (E-posta)"
              type="email"
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.target.value)}
              required
            />
            <Button
              type="submit"
              data-testid="forgot-submit"
              variant="light"
              disabled={isForgotSubmitting}
              leftSection={<IconMailForward size={16} />}
              fullWidth
            >
              {isForgotSubmitting ? "Gonderiliyor..." : "Sifirlama Baglantisi Gonder"}
            </Button>
            {forgotFeedback ? (
              <Alert
                variant="light"
                color={forgotFeedback.kind === "error" ? "red" : "teal"}
                icon={forgotFeedback.kind === "error" ? <IconAlertCircle size={16} /> : <IconCircleCheck size={16} />}
                data-testid="forgot-form-feedback"
              >
                {forgotFeedback.message}
              </Alert>
            ) : null}
          </form>
          <Text size="xs" c="dimmed" ta="center">
            JWT oturumlar 24 saat gecerlidir • API: {webEnv.VITE_API_BASE_URL}
          </Text>
        </Stack>
      </Paper>
    </main>
  );
}
