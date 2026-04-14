import { Box, Text } from 'ink';

interface KeyHint {
  key: string;
  label: string;
}

interface Props {
  hints: KeyHint[];
}

export function StatusLine({ hints }: Props) {
  return (
    <Box marginTop={1}>
      {hints.map(({ key, label }, i) => (
        <Box key={key} marginRight={2}>
          <Text color="cyan" bold>[{key}]</Text>
          <Text> {label}</Text>
        </Box>
      ))}
    </Box>
  );
}
