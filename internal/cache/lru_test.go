package cache

import (
	"testing"
	"time"
)

func TestLRU_SetAndGet(t *testing.T) {
	c := NewLRU[string](10, time.Minute)
	c.Set("key1", "val1")
	val, age, ok := c.Get("key1")
	if !ok {
		t.Fatal("expected key1 to exist")
	}
	if val != "val1" {
		t.Fatalf("expected val1, got %q", val)
	}
	if age > time.Second {
		t.Fatalf("expected age < 1s, got %v", age)
	}
}

func TestLRU_MissReturnsNotOK(t *testing.T) {
	c := NewLRU[string](10, time.Minute)
	_, _, ok := c.Get("missing")
	if ok {
		t.Fatal("expected missing key to return !ok")
	}
}

func TestLRU_TTLExpiry(t *testing.T) {
	c := NewLRU[string](10, 10*time.Millisecond)
	c.Set("key1", "val1")
	time.Sleep(20 * time.Millisecond)
	_, _, ok := c.Get("key1")
	if ok {
		t.Fatal("expected expired key to return !ok")
	}
}

func TestLRU_EvictsLRU(t *testing.T) {
	c := NewLRU[string](2, time.Minute)
	c.Set("a", "1")
	c.Set("b", "2")
	c.Set("c", "3")
	_, _, ok := c.Get("a")
	if ok {
		t.Fatal("expected 'a' to be evicted")
	}
	if c.Len() != 2 {
		t.Fatalf("expected len 2, got %d", c.Len())
	}
}

func TestLRU_Delete(t *testing.T) {
	c := NewLRU[string](10, time.Minute)
	c.Set("key1", "val1")
	c.Delete("key1")
	_, _, ok := c.Get("key1")
	if ok {
		t.Fatal("expected deleted key to return !ok")
	}
}

func TestLRU_AccessMovesToFront(t *testing.T) {
	c := NewLRU[string](2, time.Minute)
	c.Set("a", "1")
	c.Set("b", "2")
	c.Get("a") // move "a" to front
	c.Set("c", "3") // evicts "b"
	_, _, ok := c.Get("a")
	if !ok {
		t.Fatal("expected 'a' to survive")
	}
	_, _, ok = c.Get("b")
	if ok {
		t.Fatal("expected 'b' to be evicted")
	}
}
