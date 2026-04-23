import {
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Tooltip
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBuildingEstate,
  IconCar,
  IconDoorExit,
  IconShieldCheck,
  IconUserCircle
} from "@tabler/icons-react";
import { NavLink as RouterNavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

const roleAccent: Record<string, string> = {
  ADMIN: "ocean",
  RESIDENT: "teal",
  SECURITY: "yellow"
};

const roleLabel: Record<string, string> = {
  ADMIN: "Yönetici",
  RESIDENT: "Sakin",
  SECURITY: "Güvenlik"
};

export function ShellPanel() {
  const { user, session, logout } = useAuth();
  const [opened, { toggle }] = useDisclosure(false);

  const accentColor = roleAccent[user?.role ?? "ADMIN"] ?? "ocean";

  return (
    <AppShell
      data-testid="shell-panel"
      className="asys-shell"
      header={{ height: 68 }}
      navbar={{ width: 260, breakpoint: "md", collapsed: { mobile: !opened, desktop: false } }}
      padding={{ base: "md", md: "xl" }}
    >
      <AppShell.Header className="shell-header">
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
            <ThemeIcon variant="gradient" size={38} radius="xl">
              <IconBuildingEstate size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">ASYS Panel</Text>
              <Text size="xs" c="dimmed">
                Site Yönetim Sistemi
              </Text>
            </Box>
          </Group>

          <Group gap="md">
            <Group gap="xs" visibleFrom="sm">
              <Avatar color={accentColor} radius="xl" size="sm">
                <IconUserCircle size={16} />
              </Avatar>
              <Stack gap={0}>
                <Text size="sm" fw={600}>
                  {user?.name ?? "Kullanıcı"}
                </Text>
                <Text size="xs" c="dimmed">
                  {roleLabel[user?.role ?? ""] ?? user?.role ?? ""}
                </Text>
              </Stack>
            </Group>
            <Tooltip label="Oturumu kapat" withArrow>
              <Button
                type="button"
                variant="light"
                color="red"
                size="xs"
                leftSection={<IconDoorExit size={14} />}
                data-testid="logout-button"
                onClick={() => {
                  void logout();
                }}
              >
                Çıkış
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="shell-navbar">
        <AppShell.Section pb="sm">
          <Group justify="space-between" align="center">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.06em" }}>
              Aktif Rol
            </Text>
            <Badge color={accentColor} variant="light" size="sm">
              {roleLabel[user?.role ?? ""] ?? user?.role ?? "Bilinmiyor"}
            </Badge>
          </Group>
        </AppShell.Section>

        <Divider mb="sm" color="rgba(16, 66, 121, 0.08)" />

        <AppShell.Section grow component="div">
          <Stack gap={4}>
            <Text size="xs" fw={600} c="dimmed" mb={4} style={{ letterSpacing: "0.04em" }}>
              PANELLER
            </Text>
            <NavLink
              component={RouterNavLink}
              to="/panel/admin"
              label="Yönetici"
              data-testid="nav-admin"
              leftSection={<IconShieldCheck size={16} />}
              style={{ borderRadius: "10px" }}
            />
            <NavLink
              component={RouterNavLink}
              to="/panel/resident"
              label="Sakin"
              data-testid="nav-resident"
              leftSection={<IconUserCircle size={16} />}
              style={{ borderRadius: "10px" }}
            />
            <NavLink
              component={RouterNavLink}
              to="/panel/security"
              label="Güvenlik"
              data-testid="nav-security"
              leftSection={<IconCar size={16} />}
              style={{ borderRadius: "10px" }}
            />
          </Stack>
        </AppShell.Section>

        <Divider mt="auto" mb="sm" color="rgba(16, 66, 121, 0.08)" />

        <AppShell.Section>
          <Text size="xs" c="dimmed" ta="center">
            © 2026 ASYS v0.1
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
