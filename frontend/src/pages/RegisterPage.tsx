import {
  TextInput,
  PasswordInput,
  Button,
  Card,
  Title,
  Text,
  Anchor,
  Stack,
  Center,
  Alert,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function extractRegisterErrorMessage(err: any): string {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (status === 0 || err?.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check your connection.';
  }
  if (data?.detail) return String(data.detail);
  if (data && typeof data === 'object') {
    const fieldEntries = Object.entries(data);
    if (fieldEntries.length > 0) {
      const [field, value] = fieldEntries[0];
      const text = Array.isArray(value) ? value[0] : value;
      return `${field}: ${text}`;
    }
  }
  return 'Could not create account';
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    initialValues: { username: '', email: '', password: '', confirmPassword: '' },
    validate: {
      username: (v) => (v.trim().length < 3 ? 'Username must be at least 3 characters' : null),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Enter a valid email'),
      password: (v) => (v.length < 6 ? 'Password must be at least 6 characters' : null),
      confirmPassword: (v, values) =>
        v !== values.password ? 'Passwords do not match' : null,
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await register(values.username, values.email, values.password);
      notifications.show({
        title: 'Account created',
        message: 'Welcome to Inventory Manager',
        color: 'green',
      });
      navigate('/');
    } catch (err: any) {
      const message = extractRegisterErrorMessage(err);
      setErrorMessage(message);
      notifications.show({
        title: 'Registration failed',
        message,
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" className="bg-gray-50">
      <Card shadow="md" padding="xl" radius="md" w={420} withBorder>
        <Title order={2} mb="xs">
          Create account
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Sign up to start managing inventory
        </Text>
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            {errorMessage && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                variant="light"
                withCloseButton
                onClose={() => setErrorMessage(null)}
              >
                {errorMessage}
              </Alert>
            )}
            <TextInput
              label="Username"
              placeholder="Choose a username"
              autoComplete="username"
              {...form.getInputProps('username')}
            />
            <TextInput
              label="Email"
              placeholder="you@example.com"
              autoComplete="email"
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Password"
              placeholder="Create a password"
              autoComplete="new-password"
              {...form.getInputProps('password')}
            />
            <PasswordInput
              label="Confirm password"
              placeholder="Repeat password"
              autoComplete="new-password"
              {...form.getInputProps('confirmPassword')}
            />
            <Button type="submit" fullWidth loading={loading}>
              Create account
            </Button>
            <Text size="sm" ta="center">
              Already have an account?{' '}
              <Anchor component={Link} to="/login">
                Sign in
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
