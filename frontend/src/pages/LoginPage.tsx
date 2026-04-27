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

function extractLoginErrorMessage(err: any): string {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (status === 401 || status === 400) {
    return 'Username or password is incorrect. Please check your credentials and try again.';
  }
  if (status === 0 || err?.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check your connection.';
  }
  if (data?.detail) return String(data.detail);
  if (data && typeof data === 'object') {
    const firstField = Object.values(data)[0];
    if (Array.isArray(firstField) && firstField[0]) return String(firstField[0]);
    if (typeof firstField === 'string') return firstField;
  }
  return 'Something went wrong. Please try again.';
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    initialValues: { username: '', password: '' },
    validate: {
      username: (v) => (v.trim().length < 1 ? 'Username is required' : null),
      password: (v) => (v.length < 1 ? 'Password is required' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(values.username, values.password);
      notifications.show({
        title: 'Welcome back',
        message: 'You have signed in successfully',
        color: 'green',
      });
      navigate('/');
    } catch (err: any) {
      const message = extractLoginErrorMessage(err);
      setErrorMessage(message);
      notifications.show({
        title: 'Login failed',
        message,
        color: 'red',
      });
      form.setFieldValue('password', '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" className="bg-gray-50">
      <Card shadow="md" padding="xl" radius="md" w={400} withBorder>
        <Title order={2} mb="xs">
          Sign in
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Welcome to Inventory Manager
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
              placeholder="Enter your username"
              autoComplete="username"
              {...form.getInputProps('username')}
            />
            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              autoComplete="current-password"
              {...form.getInputProps('password')}
            />
            <Button type="submit" fullWidth loading={loading}>
              Sign in
            </Button>
            <Text size="sm" ta="center">
              Don&apos;t have an account?{' '}
              <Anchor component={Link} to="/register">
                Register
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
