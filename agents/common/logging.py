import logging
import os

_DEFAULT_LEVEL = os.getenv("LOG_LEVEL", "WARNING").upper()

class _LevelFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Always allow warnings and above, suppress info/debug by default
        return True


def setup_logging(level: str | None = None) -> None:
    lvl = (level or _DEFAULT_LEVEL).upper()
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        fmt = logging.Formatter(
            fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )
        handler.setFormatter(fmt)
        root.addHandler(handler)
    root.setLevel(lvl)
