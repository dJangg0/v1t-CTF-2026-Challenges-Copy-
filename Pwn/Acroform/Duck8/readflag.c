/* setuid-root helper: the only way to read the flag.
 * Build:  gcc -O2 -static -o readflag readflag.c   (then chmod 4755, root-owned)
 * The flag is /flag (root:root 0400); d8 runs as an unprivileged user, so it
 * cannot read /flag directly (no read("/flag"), no ROP open("/flag")). The
 * intended exploit must gain code execution and execve("/readflag"). */
#include <stdio.h>
#include <unistd.h>

int main(void) {
  /* become root via the setuid bit, then print the flag */
  setuid(0);
  setgid(0);
  FILE *f = fopen("/flag", "r");
  if (!f) { perror("fopen"); return 1; }
  char buf[256];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) fwrite(buf, 1, n, stdout);
  fclose(f);
  return 0;
}
