import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  Card,
  Center,
  Stack,
  Title,
  Text,
  Group,
  Button,
  ThemeIcon,
  Code,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <Center mih="100vh" p="md">
        <Card
          withBorder
          shadow="md"
          padding="xl"
          radius="md"
          maw={520}
          w="100%"
        >
          <Stack align="center" gap="md">
            <ThemeIcon variant="light" color="red" size={56} radius="xl">
              <IconAlertTriangle size={32} />
            </ThemeIcon>
            <Title order={3} ta="center">
              Something went wrong
            </Title>
            <Text c="dimmed" ta="center">
              An unexpected error occurred while rendering this page. You can
              try reloading or go back to the dashboard.
            </Text>
            <Code
              block
              color="red"
              style={{ width: '100%', maxHeight: 160, overflow: 'auto' }}
            >
              {error.message || String(error)}
            </Code>
            <Group justify="center" w="100%">
              <Button variant="default" onClick={this.handleGoHome}>
                Go to Dashboard
              </Button>
              <Button color="red" onClick={this.handleReload}>
                Reload page
              </Button>
            </Group>
          </Stack>
        </Card>
      </Center>
    );
  }
}
