"""
TODO / Deployment fixes

- The challenge is currently not solvable because:
  - flag.txt has incorrect permissions.
  - flag.py should print(FLAG) not 'FLAG'.

- Fix the deployment files before expecting a valid solve path.

- The SHA-256 hash of v1t{fake_flag} is not realistically brute-forceable,
  so the init Bash script also needs to be fixed.
"""
import os
import re
import subprocess
from flask import Flask, render_template, request

app = Flask(__name__)

BLOCKED_TOKENS = (
    "Z29vZGJ5ZSB1aXQgaSdtIGFib3V0IHRvIGdyYWR1YXRl",
    "aWYgeW91IHNvbHZlIHRoaXMgY2hhbGxlbmdlIGVhc2lseSB0aGVuIGkgdGhpbmsgeW91IHNob3VsZCBwbGF5IHNla2FpIGkgaGF2ZSBubyBjaGFuY2UgOy07",
    
)
ALLOWED_TARGET_RE = re.compile(r"^(?!.* \.)(?!.*\. )[i0-9.;?/ ]+$")

@app.route("/", methods=["GET", "POST"])
def index():
    output = ""
    target = ""

    if request.method == "POST":
        target = request.form.get("target", "")
        lowered_target = target.lower()

        if not ALLOWED_TARGET_RE.fullmatch(target):
            output = "Only host-like characters are allowed"
            return render_template("index.html", output=output, target=target)

        if any(token in lowered_target for token in BLOCKED_TOKENS):
            output = "Blocked by filter"
            return render_template("index.html", output=output, target=target)

        try:
            command = f"ping -c 1 {target}"
            output = subprocess.check_output(
                command,
                shell=True,
                stderr=subprocess.STDOUT,
                timeout=5,
                text=True,
                env={"PATH": "/bin:/usr/bin"},
            )
        except subprocess.CalledProcessError as exc:
            output = exc.output
        except subprocess.TimeoutExpired:
            output = "Command timed out"

    return render_template("index.html", output=output, target=target)


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    app.run(host=host, port=port)
