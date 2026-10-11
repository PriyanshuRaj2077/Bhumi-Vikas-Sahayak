import os
import tempfile

# Keep test runs from writing to the real app database.
os.environ.setdefault("VAR_DIR", tempfile.mkdtemp(prefix="bvs-test-"))
